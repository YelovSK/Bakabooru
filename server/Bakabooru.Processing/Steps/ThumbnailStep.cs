using Bakabooru.Core.Interfaces;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;

namespace Bakabooru.Processing.Steps;

public class ThumbnailStep : IMediaProcessingStep
{
    private readonly IImageProcessor _mediaProcessor;
    private readonly ILogger<ThumbnailStep> _logger;
    private readonly string _thumbnailPath;

    public int Order => 30;

    public ThumbnailStep(IImageProcessor mediaProcessor, ILogger<ThumbnailStep> logger, IConfiguration config)
    {
        _mediaProcessor = mediaProcessor;
        _logger = logger;
        _thumbnailPath = config.GetValue<string>("Bakabooru:Storage:ThumbnailPath") ?? "data/thumbnails";
        
        if (!Directory.Exists(_thumbnailPath))
        {
            Directory.CreateDirectory(_thumbnailPath);
        }
    }

    public async Task ExecuteAsync(MediaProcessingContext context, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(context.Md5Hash)) return;

        var destination = Path.Combine(_thumbnailPath, $"{context.Md5Hash}.jpg");
        if (!File.Exists(destination))
        {
            _logger.LogInformation("Generating thumbnail: {Path}", context.RelativePath);
            await _mediaProcessor.GenerateThumbnailAsync(context.FilePath, destination, 400, 400, cancellationToken);
        }
        
        context.ThumbnailPath = destination;
    }
}
