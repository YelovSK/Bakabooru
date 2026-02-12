using Bakabooru.Core;
using Bakabooru.Core.Interfaces;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;

namespace Bakabooru.Processing.Steps;

public class HashingStep : IMediaProcessingStep
{
    private readonly IHasherService _hasher;
    private readonly ILogger<HashingStep> _logger;
    private readonly bool _skipVideoHashing;

    public int Order => 10;

    public HashingStep(IHasherService hasher, ILogger<HashingStep> logger, Microsoft.Extensions.Configuration.IConfiguration config)
    {
        _hasher = hasher;
        _logger = logger;
        _skipVideoHashing = config.GetValue<bool>("Bakabooru:Scanner:SkipVideoHashing");
    }

    public async Task ExecuteAsync(MediaProcessingContext context, CancellationToken cancellationToken)
    {
        if (!string.IsNullOrEmpty(context.Md5Hash)) return;

        var extension = Path.GetExtension(context.FilePath);
        var isVideo = SupportedMedia.IsVideo(extension);

        if (_skipVideoHashing && isVideo)
        {
            var fileInfo = new FileInfo(context.FilePath);
            context.Md5Hash = $"QUICK_{fileInfo.Length}_{fileInfo.LastWriteTimeUtc.Ticks}";
            _logger.LogDebug("Using quick hash for video: {Path}", context.RelativePath);
        }
        else
        {
            context.Md5Hash = await _hasher.ComputeMd5Async(context.FilePath, cancellationToken);
        }
    }
}
