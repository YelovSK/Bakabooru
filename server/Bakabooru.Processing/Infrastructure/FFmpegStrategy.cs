using Bakabooru.Core;
using Bakabooru.Core.Interfaces;
using FFMpegCore;
using Microsoft.Extensions.Logging;

namespace Bakabooru.Processing.Infrastructure;

public class FFmpegStrategy : IMediaProcessorStrategy
{
    private readonly ILogger<FFmpegStrategy> _logger;

    public FFmpegStrategy(ILogger<FFmpegStrategy> logger)
    {
        _logger = logger;
    }

    public bool CanProcess(string extension)
    {
        return SupportedMedia.RequiresFfmpeg(extension);
    }

    public async Task GenerateThumbnailAsync(string sourcePath, string destinationPath, int width, int height, CancellationToken cancellationToken = default)
    {
        try
        {
            var extension = Path.GetExtension(sourcePath).ToLowerInvariant();
            
            if (extension == ".jxl")
            {
                _logger.LogDebug("Converting JXL to thumbnail: {Path}", sourcePath);
                // JXL is an image, so we just convert it using ffmpeg without seeking
                await FFMpegArguments
                    .FromFileInput(sourcePath)
                    .OutputToFile(destinationPath, true, options => options
                        .Resize(width, height)
                    )
                    .ProcessAsynchronously();
            }
            else
            {
                // Video path
                _logger.LogDebug("Probing video for thumbnail: {Path}", sourcePath);
                var analysis = await FFProbe.AnalyseAsync(sourcePath, null, cancellationToken);
                var duration = analysis.Duration;
                var captureTime = duration.TotalSeconds > 1 ? TimeSpan.FromSeconds(1) : TimeSpan.FromSeconds(0);

                _logger.LogDebug("Taking snapshot of {Path} at {Time}", sourcePath, captureTime);
                await FFMpeg.SnapshotAsync(sourcePath, destinationPath, new System.Drawing.Size(width, height), captureTime);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate thumbnail for video/jxl {Path}", sourcePath);
            throw;
        }
    }

    public async Task<ImageMetadata> GetMetadataAsync(string filePath, CancellationToken cancellationToken = default)
    {
        try
        {
            var analysis = await FFProbe.AnalyseAsync(filePath, null, cancellationToken);
            return new ImageMetadata
            {
                Width = analysis.PrimaryVideoStream?.Width ?? 0,
                Height = analysis.PrimaryVideoStream?.Height ?? 0,
                Format = analysis.Format.FormatName
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read video metadata for {Path}", filePath);
            return new ImageMetadata { Width = 0, Height = 0, Format = "Unknown" };
        }
    }
}
